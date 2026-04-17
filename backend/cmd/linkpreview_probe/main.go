// Ad-hoc probe for the link-preview fetcher. Run:
//
//	go run ./cmd/linkpreview_probe <URL>
//
// Loads the live Redis + site config the way the real server does,
// then calls linkpreview.Service.Fetch once and prints the result or
// error. Useful when a cached negative entry is masking the real
// cause of a failed fetch.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/redup/backend/config"
	"github.com/redup/backend/internal/linkpreview"
	redisx "github.com/redup/backend/internal/redis"
)

type allowAll struct{}

func (allowAll) PreviewEnabled() bool         { return true }
func (allowAll) DomainDenied(host string) bool { return false }

func main() {
	if len(os.Args) < 2 {
		fmt.Println("usage: linkpreview_probe <URL>")
		os.Exit(1)
	}
	url := os.Args[1]

	cfg := config.Load()
	rdb := redisx.Open(cfg.RedisURL)
	if cfg.LinkPreviewAllowCIDRs != "" {
		linkpreview.SetAllowedNets(strings.Split(cfg.LinkPreviewAllowCIDRs, ","))
		log.Printf("ssrf allow-list: %s", cfg.LinkPreviewAllowCIDRs)
	}
	svc := linkpreview.New(rdb, allowAll{})

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	p, err := svc.Fetch(ctx, url)
	if err != nil {
		log.Printf("Fetch error: %v", err)
	}
	out, _ := json.MarshalIndent(p, "", "  ")
	fmt.Println(string(out))
}
