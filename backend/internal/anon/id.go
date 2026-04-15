package anon

import (
	"log"
	"strings"

	"github.com/bwmarrin/snowflake"
)

// Generator produces prefixed snowflake identifiers like "redup-l8s4j9k3m2n1".
// The snowflake's base36 encoding is used because it's more compact than base10
// (~13 chars vs ~19) while staying alphanumeric.
type Generator struct {
	node   *snowflake.Node
	prefix string
}

func NewGenerator(nodeID int64, prefix string) *Generator {
	node, err := snowflake.NewNode(nodeID)
	if err != nil {
		log.Fatalf("failed to init snowflake node: %v", err)
	}
	return &Generator{node: node, prefix: normalizePrefix(prefix)}
}

// Next returns a fresh "{prefix}-{base36}" id. Not deterministic — callers
// that need stable ids within a thread must deduplicate through the mapping
// table in Repository.
func (g *Generator) Next() string {
	id := g.node.Generate().Base36()
	return g.prefix + "-" + id
}

// SetPrefix lets the admin panel update the live prefix at runtime. Existing
// ids in the mapping table are not rewritten — only new mappings pick up the
// new prefix.
func (g *Generator) SetPrefix(p string) {
	g.prefix = normalizePrefix(p)
}

func (g *Generator) Prefix() string {
	return g.prefix
}

func normalizePrefix(p string) string {
	p = strings.TrimSpace(p)
	if p == "" {
		return "Anon"
	}
	return p
}
