import * as vscode from 'vscode';

export type Priority = 'high' | 'med' | 'low' | 'none';

export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  priority: Priority;
  category?: string;
}

const HEADER = '# TODO';
const PRIORITY_TOKENS: Record<string, Priority> = {
  '!high': 'high',
  '!med': 'med',
  '!low': 'low',
};

/**
 * Reads / writes the todo list to `todo.md` at the root of the first workspace
 * folder. The on-disk format is a human-editable GitHub task list:
 *
 *   # TODO
 *
 *   - [ ] Read paper !high @research
 *   - [x] Code review @dev
 *
 * Line order is the display order. `!high|!med|!low` set the priority and
 * `@word` sets the category; both are optional.
 */
export class TodoStore {
  /** Uri of the workspace's todo.md, or undefined when no folder is open. */
  getTodoUri(): vscode.Uri | undefined {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      return undefined;
    }
    return vscode.Uri.joinPath(folder.uri, 'todo.md');
  }

  async read(): Promise<TodoItem[]> {
    const uri = this.getTodoUri();
    if (!uri) {
      return [];
    }
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      return this.parse(Buffer.from(bytes).toString('utf8'));
    } catch {
      // File does not exist yet.
      return [];
    }
  }

  async write(items: TodoItem[]): Promise<void> {
    const uri = this.getTodoUri();
    if (!uri) {
      throw new Error('No workspace folder is open, cannot save todo.md.');
    }
    const data = Buffer.from(this.serialize(items), 'utf8');
    await vscode.workspace.fs.writeFile(uri, data);
  }

  parse(text: string): TodoItem[] {
    const items: TodoItem[] = [];
    const lines = text.split(/\r?\n/);
    const lineRe = /^\s*-\s*\[( |x|X)\]\s*(.*)$/;

    let i = 0;
    for (const line of lines) {
      const m = lineRe.exec(line);
      if (!m) {
        continue;
      }
      const done = m[1].toLowerCase() === 'x';
      let rest = m[2];

      let priority: Priority = 'none';
      let category: string | undefined;

      // Extract @category (first match wins).
      const catMatch = /(^|\s)@(\S+)/.exec(rest);
      if (catMatch) {
        category = catMatch[2];
        rest = rest.replace(catMatch[0], ' ');
      }

      // Extract priority token.
      for (const [token, value] of Object.entries(PRIORITY_TOKENS)) {
        const tokenRe = new RegExp(`(^|\\s)${token}(?=\\s|$)`, 'i');
        if (tokenRe.test(rest)) {
          priority = value;
          rest = rest.replace(tokenRe, ' ');
          break;
        }
      }

      items.push({
        id: `t${i++}`,
        text: rest.trim(),
        done,
        priority,
        category,
      });
    }
    return items;
  }

  serialize(items: TodoItem[]): string {
    const lines: string[] = [HEADER, ''];
    for (const item of items) {
      const box = item.done ? '[x]' : '[ ]';
      const parts = [`- ${box}`, item.text.trim()];
      if (item.priority !== 'none') {
        parts.push(`!${item.priority}`);
      }
      if (item.category) {
        parts.push(`@${item.category}`);
      }
      lines.push(parts.filter(Boolean).join(' '));
    }
    lines.push('');
    return lines.join('\n');
  }
}
