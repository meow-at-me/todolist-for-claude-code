import * as vscode from 'vscode';
import * as os from 'os';
import { TodoStore } from './TodoStore';
import { TodoViewProvider } from './TodoViewProvider';

export function activate(context: vscode.ExtensionContext): void {
  const store = new TodoStore();

  // Suppress the file-watcher refresh that our own write would trigger,
  // which would otherwise cause a redundant reload loop.
  let ignoreNextWatch = false;
  const provider = new TodoViewProvider(context.extensionUri, store, () => {
    ignoreNextWatch = true;
    // Clear the flag shortly after, in case no watch event arrives.
    setTimeout(() => {
      ignoreNextWatch = false;
    }, 500);
  });

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(TodoViewProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  // Watch todo.md so external edits (incl. edits made by Claude Code) refresh the view.
  const watcher = vscode.workspace.createFileSystemWatcher('**/todo.md');
  const onChange = () => {
    if (ignoreNextWatch) {
      ignoreNextWatch = false;
      return;
    }
    void provider.refresh();
  };
  watcher.onDidChange(onChange);
  watcher.onDidCreate(onChange);
  watcher.onDidDelete(onChange);
  context.subscriptions.push(watcher);

  // Re-apply colors live when the user changes todolist.colors.* settings.
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('todolist.colors')) {
        provider.postColors();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('todolist.addTodo', async () => {
      const text = await vscode.window.showInputBox({
        prompt: vscode.l10n.t('New todo'),
        placeHolder: vscode.l10n.t('e.g. Send email'),
      });
      if (text && text.trim()) {
        await provider.addTodo(text.trim());
      }
    }),
    vscode.commands.registerCommand('todolist.refresh', () => provider.refresh()),
    vscode.commands.registerCommand('todolist.openFile', async () => {
      const uri = store.getTodoUri();
      if (!uri) {
        vscode.window.showWarningMessage(vscode.l10n.t('No workspace folder is open.'));
        return;
      }
      try {
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);
      } catch {
        vscode.window.showInformationMessage(
          vscode.l10n.t('No todo.md yet. Add a todo to create it.')
        );
      }
    }),
    vscode.commands.registerCommand('todolist.setupClaudeCode', () =>
      setupClaudeCodeIntegration(true)
    )
  );

  // Offer to wire up Claude Code auto-update on first run.
  void maybeOfferClaudeCodeSetup(context);
}

export function deactivate(): void {
  // Nothing to clean up beyond context.subscriptions.
}

const CLAUDE_BLOCK_START = '<!-- todolist-extension:start -->';
const CLAUDE_BLOCK_END = '<!-- todolist-extension:end -->';

const CLAUDE_BODY_EN = [
  '## Todo List integration (Todo List for Claude Code extension)',
  'When the user mentions an upcoming task in conversation — e.g. "I need to … later",',
  '"remember to …", "don\'t forget to …" — add a single line to `todo.md` at the workspace',
  'root in the format below. If the file does not exist, create it with a `# TODO` header.',
  '',
  'Format: `- [ ] <task> [!high|!med|!low] [@category]`',
  '  - `!high|!med|!low` priority (optional), `@category` (optional)',
  '',
  'Rules:',
  '- Do not add a duplicate if the same task already exists.',
  '- After adding, note it briefly in one line (e.g. "Added to todo.md").',
  '- Only add when the user clearly states a task; if ambiguous, ask first.',
].join('\n');

const CLAUDE_BODY_KO = [
  '## Todo List 연동 (Todo List for Claude Code 확장)',
  '대화 중 사용자가 앞으로 할 일을 언급하면 — 예: "나중에 ~ 해야 해", "~ 하기", "잊지 말고 ~",',
  '"이따 메일 보내야 해" 등 — 워크스페이스 루트의 `todo.md` 에 아래 형식으로 한 줄을 추가한다.',
  '파일이 없으면 `# TODO` 헤더와 함께 새로 만든다.',
  '',
  '형식: `- [ ] <할 일> [!high|!med|!low] [@카테고리]`',
  '  - `!high|!med|!low` 우선순위(선택), `@카테고리` 분류(선택)',
  '',
  '규칙:',
  '- 이미 같은 할 일이 있으면 중복으로 추가하지 않는다.',
  '- 추가한 뒤 한 줄로 짧게 "todo.md 에 추가했어요"처럼 알린다.',
  '- 사용자가 명백히 할 일을 말한 경우에만 추가하고, 애매하면 먼저 물어본다.',
].join('\n');

function claudeIntegrationBlock(): string {
  const isKorean = (vscode.env.language || '').toLowerCase().startsWith('ko');
  const body = isKorean ? CLAUDE_BODY_KO : CLAUDE_BODY_EN;
  return [CLAUDE_BLOCK_START, body, CLAUDE_BLOCK_END].join('\n');
}

function globalClaudeMdUri(): vscode.Uri {
  return vscode.Uri.file(`${os.homedir()}/.claude/CLAUDE.md`);
}

async function maybeOfferClaudeCodeSetup(context: vscode.ExtensionContext): Promise<void> {
  const KEY = 'todolist.claudeSetupHandled';
  if (context.globalState.get<boolean>(KEY)) {
    return;
  }

  // Already configured? Then mark as handled silently.
  if (await claudeBlockExists()) {
    await context.globalState.update(KEY, true);
    return;
  }

  const setUp = vscode.l10n.t('Set up');
  const later = vscode.l10n.t('Later');
  const choice = await vscode.window.showInformationMessage(
    vscode.l10n.t(
      'Connect with Claude Code? When you mention a task in chat (e.g. "I need to send an email later"), it\'s auto-added to todo.md. (Adds one rule block to ~/.claude/CLAUDE.md)'
    ),
    setUp,
    later
  );

  if (choice === setUp) {
    await setupClaudeCodeIntegration(false);
  }
  // Either way, don't nag again.
  await context.globalState.update(KEY, true);
}

async function claudeBlockExists(): Promise<boolean> {
  try {
    const bytes = await vscode.workspace.fs.readFile(globalClaudeMdUri());
    return Buffer.from(bytes).toString('utf8').includes(CLAUDE_BLOCK_START);
  } catch {
    return false;
  }
}

async function setupClaudeCodeIntegration(announceIfExists: boolean): Promise<void> {
  const uri = globalClaudeMdUri();
  let existing = '';
  try {
    existing = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
  } catch {
    // File / directory may not exist yet; writeFile creates the directory.
    existing = '';
  }

  const block = claudeIntegrationBlock();

  let next: string;
  if (existing.includes(CLAUDE_BLOCK_START) && existing.includes(CLAUDE_BLOCK_END)) {
    if (!announceIfExists) {
      return;
    }
    // Replace the managed block in place.
    const start = existing.indexOf(CLAUDE_BLOCK_START);
    const end = existing.indexOf(CLAUDE_BLOCK_END) + CLAUDE_BLOCK_END.length;
    next = existing.slice(0, start) + block + existing.slice(end);
  } else {
    const sep = existing.trim().length ? '\n\n' : '';
    next = existing + sep + block + '\n';
  }

  try {
    await vscode.workspace.fs.writeFile(uri, Buffer.from(next, 'utf8'));
    vscode.window.showInformationMessage(
      vscode.l10n.t('Claude Code integration is set up! Added a rule to ~/.claude/CLAUDE.md.')
    );
  } catch (e) {
    vscode.window.showErrorMessage(
      vscode.l10n.t('Setup failed: {0}', e instanceof Error ? e.message : String(e))
    );
  }
}
