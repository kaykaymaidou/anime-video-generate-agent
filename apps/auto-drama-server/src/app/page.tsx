export default function HomePage() {
  return (
    <main>
      <h1>Auto-Drama Server</h1>
      <p>网关由自定义 Node 进程启动（见仓库根目录 <code>pnpm dev</code>）。HTTP API：<code>/api/health</code>、<code>/api/tasks</code>。</p>
    </main>
  );
}
