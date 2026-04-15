export default function MessagesEmptyState() {
  return (
    <div className="flex h-full min-h-[calc(100vh-3.5rem)] items-center justify-center px-8">
      <div className="max-w-md text-center">
        <div className="mb-3 text-5xl">💬</div>
        <h2 className="mb-2 text-lg font-semibold text-foreground">选择一个对话开始</h2>
        <p className="mb-6 text-sm text-muted-foreground">
          从左侧收件箱选择一条对话，或开启一个新对话。
        </p>
        <div className="mx-auto max-w-sm rounded-lg border border-border bg-card p-4 text-left text-xs text-muted-foreground">
          <div className="mb-2 font-semibold text-foreground">关于私信</div>
          <ul className="space-y-1.5">
            <li>· 你和对方可以一对一聊天，第三方不可见</li>
            <li>· Bot 私信需在「设置 → Bot 授权」中开启</li>
            <li>· 官方系统消息无法回复</li>
            <li>· 举报 / 骚扰内容请使用右上角菜单</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
