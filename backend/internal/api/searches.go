package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/danielgtaylor/huma/v2"

	"github.com/Hari-Hristov/the-great-find/backend/internal/scheduler"
)

// SavedSearchInput is the payload for create/update.
type SavedSearchInput struct {
	Name              string          `json:"name" minLength:"1" maxLength:"200" doc:"Human-readable label."`
	Platform          string          `json:"platform,omitempty" enum:"olx" doc:"Defaults to olx."`
	Country           string          `json:"country,omitempty" doc:"ISO-3166 alpha-2; defaults to BG."`
	QueryParams       json.RawMessage `json:"query_params" doc:"Raw query params. Must be a JSON object whose values are strings or arrays of strings (keyword_variants is an array); keys are filtered against the parser config's allow-list at poll time."`
	AlertCriteria     json.RawMessage `json:"alert_criteria,omitempty" doc:"Optional alert rules; see /api/searches/{id}#alert-criteria-shape."`
	PollIntervalMin   int             `json:"poll_interval_min,omitempty" minimum:"5" maximum:"720" doc:"Minutes between polls. Defaults to 30."`
	MaxListingAgeDays int             `json:"max_listing_age_days,omitempty" enum:"30,60,90,120" doc:"Recency cutoff in days. Listings older than this are dropped at scrape time. Defaults to 90."`
	Active            *bool           `json:"active,omitempty" doc:"Defaults to true on create."`
}

func (in SavedSearchInput) defaults() SavedSearchInput {
	if in.Platform == "" {
		in.Platform = "olx"
	}
	if in.Country == "" {
		in.Country = "BG"
	}
	if in.PollIntervalMin == 0 {
		in.PollIntervalMin = 30
	}
	if in.MaxListingAgeDays == 0 {
		in.MaxListingAgeDays = 90
	}
	return in
}

func resolveActive(in SavedSearchInput) bool {
	if in.Active != nil {
		return *in.Active
	}
	return true
}

func (in SavedSearchInput) validate() error {
	if len(in.QueryParams) == 0 {
		return huma.Error400BadRequest("query_params is required")
	}
	// Values are strings, except keyword_variants which the scheduler reads as
	// an array of strings (see scheduler.popKeywordVariants). Decoding into
	// map[string]string would reject that array outright, so probe loosely and
	// check the value shapes by hand.
	var probe map[string]any
	if err := json.Unmarshal(in.QueryParams, &probe); err != nil {
		return huma.Error400BadRequest("query_params must be a JSON object: " + err.Error())
	}
	for key, val := range probe {
		if _, ok := val.(string); ok {
			continue
		}
		list, ok := val.([]any)
		if !ok {
			return huma.Error400BadRequest(fmt.Sprintf("query_params[%q] must be a string or an array of strings", key))
		}
		for _, item := range list {
			if _, ok := item.(string); !ok {
				return huma.Error400BadRequest(fmt.Sprintf("query_params[%q] must contain only string values", key))
			}
		}
	}
	if len(in.AlertCriteria) > 0 {
		var anyShape map[string]any
		if err := json.Unmarshal(in.AlertCriteria, &anyShape); err != nil {
			return huma.Error400BadRequest("alert_criteria must be a JSON object: " + err.Error())
		}
	}
	return nil
}

func registerSearches(api huma.API, q Queries, sched Reloader) {
	huma.Register(api, huma.Operation{
		OperationID: "list-searches",
		Method:      "GET",
		Path:        "/searches",
		Summary:     "List saved searches",
	}, func(ctx context.Context, _ *struct{}) (*struct{ Body ListSearchesResponse }, error) {
		rows, err := q.ListAllSavedSearches(ctx)
		if err != nil {
			return nil, err
		}
		return &struct{ Body ListSearchesResponse }{Body: ListSearchesResponse{Items: rows}}, nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "get-search",
		Method:      "GET",
		Path:        "/searches/{id}",
		Summary:     "Get one saved search",
	}, func(ctx context.Context, in *struct {
		ID int64 `path:"id"`
	}) (*struct{ Body SavedSearchRow }, error) {
		row, err := q.GetSavedSearch(ctx, in.ID)
		if err != nil {
			return nil, err
		}
		if row == nil {
			return nil, huma.Error404NotFound("saved search not found")
		}
		return &struct{ Body SavedSearchRow }{Body: *row}, nil
	})

	huma.Register(api, huma.Operation{
		OperationID:   "create-search",
		Method:        "POST",
		Path:          "/searches",
		Summary:       "Create a saved search and trigger scheduler reload",
		DefaultStatus: 201,
	}, func(ctx context.Context, in *struct {
		Body SavedSearchInput
	}) (*struct{ Body SavedSearchRow }, error) {
		body := in.Body.defaults()
		if err := body.validate(); err != nil {
			return nil, err
		}
		row, err := q.CreateSavedSearch(ctx, CreateSavedSearchInput{
			Name:              body.Name,
			Platform:          body.Platform,
			Country:           body.Country,
			QueryParams:       string(body.QueryParams),
			AlertCriteria:     string(body.AlertCriteria),
			PollIntervalMin:   body.PollIntervalMin,
			MaxListingAgeDays: body.MaxListingAgeDays,
			Active:            resolveActive(body),
		})
		if err != nil {
			return nil, fmt.Errorf("create saved search: %w", err)
		}
		if err := sched.Reload(ctx); err != nil {
			return nil, fmt.Errorf("scheduler reload after create: %w", err)
		}
		return &struct{ Body SavedSearchRow }{Body: row}, nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "update-search",
		Method:      "PUT",
		Path:        "/searches/{id}",
		Summary:     "Update a saved search and reload the scheduler",
	}, func(ctx context.Context, in *struct {
		ID   int64 `path:"id"`
		Body SavedSearchInput
	}) (*struct{ Body SavedSearchRow }, error) {
		body := in.Body.defaults()
		if err := body.validate(); err != nil {
			return nil, err
		}
		row, err := q.UpdateSavedSearch(ctx, UpdateSavedSearchInput{
			ID:                in.ID,
			Name:              body.Name,
			QueryParams:       string(body.QueryParams),
			AlertCriteria:     string(body.AlertCriteria),
			PollIntervalMin:   body.PollIntervalMin,
			MaxListingAgeDays: body.MaxListingAgeDays,
			Active:            resolveActive(body),
		})
		if err != nil {
			if errors.Is(err, ErrNotFound) {
				return nil, huma.Error404NotFound("saved search not found")
			}
			return nil, err
		}
		if err := sched.Reload(ctx); err != nil {
			return nil, fmt.Errorf("scheduler reload after update: %w", err)
		}
		return &struct{ Body SavedSearchRow }{Body: row}, nil
	})

	huma.Register(api, huma.Operation{
		OperationID:   "delete-search",
		Method:        "DELETE",
		Path:          "/searches/{id}",
		Summary:       "Delete a saved search and reload the scheduler",
		DefaultStatus: 204,
	}, func(ctx context.Context, in *struct {
		ID int64 `path:"id"`
	}) (*struct{}, error) {
		if err := q.DeleteSavedSearch(ctx, in.ID); err != nil {
			if errors.Is(err, ErrNotFound) {
				return nil, huma.Error404NotFound("saved search not found")
			}
			return nil, err
		}
		if err := sched.Reload(ctx); err != nil {
			return nil, fmt.Errorf("scheduler reload after delete: %w", err)
		}
		return &struct{}{}, nil
	})

	huma.Register(api, huma.Operation{
		OperationID:   "poll-search",
		Method:        "POST",
		Path:          "/searches/{id}/poll",
		Summary:       "Trigger an immediate poll for one saved search",
		DefaultStatus: 202,
	}, func(ctx context.Context, in *struct {
		ID int64 `path:"id"`
	}) (*struct{}, error) {
		if err := sched.PollSearchByID(ctx, in.ID); err != nil {
			if errors.Is(err, scheduler.ErrSearchNotRunning) {
				return nil, huma.Error404NotFound("saved search not running")
			}
			return nil, err
		}
		return &struct{}{}, nil
	})

	huma.Register(api, huma.Operation{
		OperationID:   "poll-all-searches",
		Method:        "POST",
		Path:          "/searches/poll",
		Summary:       "Trigger an immediate poll for every active saved search",
		DefaultStatus: 202,
	}, func(ctx context.Context, _ *struct{}) (*struct{ Body PollAllSearchesResponse }, error) {
		count := sched.PollAll(ctx)
		return &struct{ Body PollAllSearchesResponse }{Body: PollAllSearchesResponse{Count: count}}, nil
	})
}
