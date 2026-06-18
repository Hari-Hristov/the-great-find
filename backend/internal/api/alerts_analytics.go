package api

import (
	"context"
	"errors"

	"github.com/danielgtaylor/huma/v2"
)

var allowedTagColors = map[string]bool{
	"red": true, "orange": true, "yellow": true, "green": true,
	"blue": true, "purple": true, "pink": true,
}

func registerAlerts(api huma.API, q Queries) {
	huma.Register(api, huma.Operation{
		OperationID: "list-alerts",
		Method:      "GET",
		Path:        "/alerts",
		Summary:     "List recently fired alerts joined with listing summary",
	}, func(ctx context.Context, in *struct {
		Limit int `query:"limit" required:"false" minimum:"1" maximum:"500" default:"100"`
	}) (*struct{ Body ListAlertsResponse }, error) {
		limit := in.Limit
		if limit == 0 {
			limit = 100
		}
		rows, err := q.ListRecentAlerts(ctx, limit)
		if err != nil {
			return nil, err
		}
		return &struct{ Body ListAlertsResponse }{Body: ListAlertsResponse{Items: rows}}, nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "tag-alert",
		Method:      "PATCH",
		Path:        "/alerts/{id}",
		Summary:     "Set or clear a tag on an alert",
	}, func(ctx context.Context, in *struct {
		ID   int64 `path:"id"`
		Body struct {
			TagLabel *string `json:"tag_label"`
			TagColor *string `json:"tag_color"`
		}
	}) (*struct{}, error) {
		label := ""
		color := ""
		if in.Body.TagLabel != nil {
			label = *in.Body.TagLabel
		}
		if in.Body.TagColor != nil {
			color = *in.Body.TagColor
		}
		if len(label) > 100 {
			return nil, huma.Error422UnprocessableEntity("tag_label too long (max 100 chars)")
		}
		if color != "" && !allowedTagColors[color] {
			return nil, huma.Error422UnprocessableEntity("tag_color must be one of: red, orange, yellow, green, blue, purple, pink")
		}
		if err := q.TagAlert(ctx, in.ID, label, color); err != nil {
			if errors.Is(err, ErrNotFound) {
				return nil, huma.Error404NotFound("alert not found")
			}
			return nil, err
		}
		return &struct{}{}, nil
	})
}

func registerAnalytics(api huma.API, q Queries) {
	huma.Register(api, huma.Operation{
		OperationID: "search-analytics",
		Method:      "GET",
		Path:        "/analytics/searches/{id}",
		Summary:     "Per-search analytics: min/avg/count plus a daily EUR trend",
	}, func(ctx context.Context, in *SearchAnalyticsInput) (*struct{ Body AnalyticsRow }, error) {
		windowDays := in.WindowDays
		if windowDays == 0 {
			windowDays = 30
		}
		scope := in.Scope
		if scope == "" {
			scope = "active"
		}
		f := AnalyticsFilter{
			SearchID:   in.ID,
			WindowDays: windowDays,
			Scope:      scope,
		}
		if in.PriceEURMin > 0 {
			v := in.PriceEURMin
			f.PriceEURMin = &v
		}
		if in.PriceEURMax > 0 {
			v := in.PriceEURMax
			f.PriceEURMax = &v
		}
		row, err := q.AnalyticsForSearch(ctx, f)
		if err != nil {
			return nil, err
		}
		return &struct{ Body AnalyticsRow }{Body: row}, nil
	})
}
