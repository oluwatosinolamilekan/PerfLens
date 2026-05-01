import '../styles/globals.css';

const params = new URLSearchParams(window.location.search);
const appUrl = params.get('appUrl') || '';
const fallbackUrl = params.get('fallbackUrl') || '';
const agentName = params.get('agentName') || 'AI assistant';
let fallbackTimer: number | null = null;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return char;
    }
  });
}

function openFallback(): void {
  if (fallbackUrl) {
    window.location.href = fallbackUrl;
  }
}

function cancelFallback(): void {
  if (fallbackTimer !== null) {
    window.clearTimeout(fallbackTimer);
    fallbackTimer = null;
  }
}

const safeAgentName = escapeHtml(agentName);

document.title = `Opening ${agentName}`;
document.body.className = 'min-h-screen bg-perf-bg text-perf-text flex items-center justify-center px-6';
document.body.innerHTML = `
  <main class="max-w-md w-full rounded-lg border border-perf-border bg-perf-surface p-5 text-center">
    <div class="mx-auto mb-3 h-8 w-8 rounded-md bg-perf-accent/15 text-perf-accent flex items-center justify-center">
      <svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    </div>
    <h1 class="text-sm font-semibold">Opening ${safeAgentName}</h1>
    <p class="mt-2 text-xs text-perf-muted leading-relaxed">
      If the desktop app is installed, your browser may ask for permission to open it.
      If nothing opens, use the download link below.
    </p>
    <div class="mt-4 flex items-center justify-center gap-2">
      <button id="retry-app" class="h-8 rounded bg-perf-accent/20 px-3 text-xs font-medium text-perf-accent hover:bg-perf-accent/30">
        Try again
      </button>
      <button id="open-fallback" class="h-8 rounded bg-perf-highlight px-3 text-xs font-medium text-perf-text hover:bg-perf-border">
        Download
      </button>
    </div>
  </main>
`;

function openApp(): void {
  if (!appUrl) {
    openFallback();
    return;
  }

  window.location.href = appUrl;
  cancelFallback();
  fallbackTimer = window.setTimeout(() => {
    if (document.visibilityState === 'visible') {
      openFallback();
    }
  }, 1800);
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    cancelFallback();
  }
});

document.getElementById('retry-app')?.addEventListener('click', openApp);
document.getElementById('open-fallback')?.addEventListener('click', openFallback);

openApp();
