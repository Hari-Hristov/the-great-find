package main

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"os"
	"time"
)

func main() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	addrs, err := net.DefaultResolver.LookupHost(ctx, "www.olx.bg")
	if err != nil {
		fmt.Fprintln(os.Stderr, "LookupHost:", err)
		os.Exit(1)
	}
	fmt.Println("DNS OK:", addrs)

	req, _ := http.NewRequestWithContext(ctx, "GET", "https://www.olx.bg/elektronika/igri-i-konzoli/q-oled/?currency=EUR", nil)
	req.Header.Set("User-Agent", "the-great-find/1.0 (+personal use)")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		fmt.Fprintln(os.Stderr, "HTTP:", err)
		os.Exit(2)
	}
	defer resp.Body.Close()
	fmt.Println("HTTP", resp.StatusCode, "ct=", resp.Header.Get("Content-Type"))
}
