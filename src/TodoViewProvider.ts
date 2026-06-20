import * as vscode from 'vscode';
import { TodoStore, TodoItem, Priority } from './TodoStore';

export class TodoViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'todolist.view';

  private view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly store: TodoStore,
    /** Called right before the extension writes todo.md, so the file watcher
     *  can ignore the self-induced change and avoid a refresh loop. */
    private readonly beforeWrite: () => void
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')],
    };

    webviewView.webview.html = this.getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      await this.handleMessage(msg);
    });
  }

  /** Re-read todo.md and push the fresh state to the webview. */
  async refresh(): Promise<void> {
    if (!this.view) {
      return;
    }
    const items = await this.store.read();
    this.view.webview.postMessage({ type: 'state', items });
  }

  /** Push localized UI strings used by the webview's dynamic rendering. */
  postStrings(): void {
    if (!this.view) {
      return;
    }
    this.view.webview.postMessage({
      type: 'strings',
      strings: {
        prioNone: vscode.l10n.t('—'),
        prioHigh: vscode.l10n.t('High'),
        prioMed: vscode.l10n.t('Medium'),
        prioLow: vscode.l10n.t('Low'),
        catAdd: vscode.l10n.t('+ category'),
        catPlaceholder: vscode.l10n.t('category'),
        tipDrag: vscode.l10n.t('Drag to reorder'),
        tipEditText: vscode.l10n.t('Double-click to edit'),
        tipEditCat: vscode.l10n.t('Click to edit category'),
        tipDelete: vscode.l10n.t('Delete'),
        tipPriority: vscode.l10n.t('Priority'),
        sortLabel: vscode.l10n.t('Sort'),
        sortManual: vscode.l10n.t('Manual'),
        sortPriority: vscode.l10n.t('Priority'),
        sortCategory: vscode.l10n.t('Category'),
        sectionDone: vscode.l10n.t('Done'),
      },
    });
  }

  /** Push the user's custom priority colors to the webview as CSS vars.
   *  Empty values fall back to the theme colors in style.css. */
  postColors(): void {
    if (!this.view) {
      return;
    }
    const cfg = vscode.workspace.getConfiguration('todolist');
    this.view.webview.postMessage({
      type: 'colors',
      colors: {
        high: cfg.get<string>('colors.high') ?? '',
        med: cfg.get<string>('colors.med') ?? '',
        low: cfg.get<string>('colors.low') ?? '',
        done: cfg.get<string>('colors.doneOpacity') ?? '',
      },
    });
  }

  /** Add a todo programmatically (used by the addTodo command). */
  async addTodo(text: string, priority: Priority = 'none', category?: string): Promise<void> {
    const items = await this.store.read();
    items.push({ id: `t${items.length}`, text, done: false, priority, category });
    await this.save(items);
  }

  private async handleMessage(msg: any): Promise<void> {
    if (msg?.type === 'ready') {
      this.postStrings();
      this.postColors();
      await this.refresh();
      return;
    }

    const items = await this.store.read();

    switch (msg?.type) {
      case 'add': {
        items.push({
          id: `t${items.length}`,
          text: String(msg.text ?? '').trim(),
          done: false,
          priority: 'none',
          category: undefined,
        });
        break;
      }
      case 'toggle': {
        const it = items.find((i) => i.id === msg.id);
        if (it) {
          it.done = !it.done;
        }
        break;
      }
      case 'delete': {
        const idx = items.findIndex((i) => i.id === msg.id);
        if (idx >= 0) {
          items.splice(idx, 1);
        }
        break;
      }
      case 'edit': {
        const it = items.find((i) => i.id === msg.id);
        if (it) {
          it.text = String(msg.text ?? '').trim();
        }
        break;
      }
      case 'setPriority': {
        const it = items.find((i) => i.id === msg.id);
        if (it) {
          it.priority = msg.priority as Priority;
        }
        break;
      }
      case 'setCategory': {
        const it = items.find((i) => i.id === msg.id);
        if (it) {
          const cat = String(msg.category ?? '').trim();
          it.category = cat ? cat.replace(/\s+/g, '-') : undefined;
        }
        break;
      }
      case 'reorder': {
        const order: string[] = msg.order ?? [];
        const map = new Map(items.map((i) => [i.id, i] as const));
        const reordered: TodoItem[] = [];
        for (const id of order) {
          const it = map.get(id);
          if (it) {
            reordered.push(it);
            map.delete(id);
          }
        }
        // Append any items not present in the order list (safety).
        for (const it of map.values()) {
          reordered.push(it);
        }
        await this.save(reordered);
        return;
      }
      default:
        return;
    }

    await this.save(items);
  }

  private async save(items: TodoItem[]): Promise<void> {
    this.beforeWrite();
    await this.store.write(items);
    await this.refresh();
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'main.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'style.css')
    );
    const nonce = getNonce();

    return /* html */ `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link href="${styleUri}" rel="stylesheet" />
  <title>Todo List</title>
</head>
<body>
  <div class="sort-row">
    <label id="sortLabel" for="sortSelect"></label>
    <select id="sortSelect"></select>
  </div>
  <ul id="list" class="todo-list"></ul>
  <p id="empty" class="empty" hidden>${escapeHtml(vscode.l10n.t('No todos yet.'))}</p>
  <div class="add-row">
    <input id="newInput" type="text" placeholder="${escapeHtml(vscode.l10n.t('+ New todo (Enter)'))}" />
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
