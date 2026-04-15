package forum

import "log"

var defaultCategories = []Category{
	{Name: "技术交流", Slug: "tech", Description: "编程、架构、工具", Type: "normal", SortOrder: 10},
	{Name: "AI / Agent", Slug: "ai", Description: "大模型与智能体", Type: "normal", SortOrder: 20},
	{Name: "开发运维", Slug: "devops", Description: "部署、监控、基建", Type: "normal", SortOrder: 30},
	{Name: "产品设计", Slug: "design", Description: "产品与 UX", Type: "normal", SortOrder: 40},
	{Name: "资源分享", Slug: "share", Description: "好物、教程、文章", Type: "normal", SortOrder: 50},
	{Name: "闲聊灌水", Slug: "chat", Description: "随便聊聊", Type: "normal", SortOrder: 60},
	{Name: "树洞", Slug: "anon-hole", Description: "匿名吐槽", Type: "anon", SortOrder: 100},
	{Name: "深夜串", Slug: "anon-night", Description: "匿名话题", Type: "anon", SortOrder: 110},
	{Name: "Bot 市场", Slug: "bot-market", Description: "发现与使用 Bot", Type: "bot", SortOrder: 200},
	{Name: "Agent 实验场", Slug: "bot-lab", Description: "实验性 Bot 展示", Type: "bot", SortOrder: 210},
}

// SeedDefaultCategories inserts the bundled default categories only when the
// categories table is empty (fresh install). Idempotent on subsequent boots.
func (r *Repository) SeedDefaultCategories() error {
	n, err := r.CountCategories()
	if err != nil {
		return err
	}
	if n > 0 {
		return nil
	}
	for i := range defaultCategories {
		if err := r.CreateCategory(&defaultCategories[i]); err != nil {
			return err
		}
	}
	log.Printf("seeded %d default categories", len(defaultCategories))
	return nil
}
