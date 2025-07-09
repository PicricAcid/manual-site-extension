import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

async function commitWithzdateUpdate() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('ワークスペースが開かれていません。');
        return;
    }

    const root = workspaceFolders[0].uri.fsPath;
    const contentsDir = path.join(root, 'docs', 'contents');
    const { execSync, exec } = require('child_process');

    if (!fs.existsSync(contentsDir)) {
        vscode.window.showErrorMessage('コンテンツディレクトリが存在しません。');
        return;
    }

    const gitStatus = execSync('git status --porcelain docs/contents', { cwd: root }).toString();
    const lines = gitStatus.split('\n').map((line: string) => line.trim()).filter(Boolean);

    const modifiedFiles = lines
        .filter((line: string) => line.match(/^[AM]\s+docs\/contents\/.+\.md$/))
        .map((line: string) => line.replace(/^[AM]\s+/, ''))
        .map((relPath: string) => path.join(root, relPath))
        .filter(fs.existsSync);
    
    if (modifiedFiles.length === 0) {
        vscode.window.showInformationMessage('変更された記事がありません。');
        return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const updatedFiles: string[] = [];

    for (const filePath of modifiedFiles) {
        const content = fs.readFileSync(filePath, 'utf8');
        const match = content.match(/^---\n([\s\S]+?)\n---\n([\s\S]*)$/);
        if (!match) continue;

        const frontRaw = match[1];
        const body = match[2];
        const lines = frontRaw.split('\n');
        let updated = false;
        let hasDate = false;
        let newLines: string[] = [];

        for (let line of lines) {
            if (line.startsWith('date:')) {
                hasDate = true;
                newLines.push(line);
            } else if (line.startsWith('lastmod:')) {
                newLines.push(`lastmod: ${today}`);
                updated = true;
            } else {
                newLines.push(line);
            }
        }

        if (!hasDate) {
            newLines.unshift(`date: ${today}`);
            updated = true;
        }

        if (!lines.some(l => l.startsWith('lastmod:'))) {
            newLines.push(`lastmod: ${today}`);
            updated = true;
        }

        if (updated) {
            const newContent = `---\n${newLines.join('\n')}\n---\n${body}`;
            fs.writeFileSync(filePath, newContent, 'utf8');
            updatedFiles.push(path.relative(root, filePath));
        }
    }

    if (updatedFiles.length === 0) {
        vscode.window.showInformationMessage('更新された記事はありません。');
        return;
    }

    const commitMsgPath = path.join(root, '.git', 'COMMIT_EDITMSG');

    const template = [
        '# コミットメッセージをこのファイルに記述してください。',
        '# 行頭が # の行は無視されます。',
        '#',
        '# 編集を保存するとコミットされます。',
        ''
    ].join('\n');

    await fs.promises.mkdir(path.dirname(commitMsgPath), { recursive: true });
    await fs.promises.writeFile(commitMsgPath, '# コミットメッセージを記述してください\n', 'utf8');

    const doc = await vscode.workspace.openTextDocument(commitMsgPath);
    await vscode.window.showTextDocument(doc);

    const confirmed = await new Promise<boolean>((resolve) => {
        const watcher = vscode.workspace.onDidSaveTextDocument(savedDoc => {
            if (savedDoc.uri.fsPath === commitMsgPath) {
                watcher.dispose();
                resolve(true);
            }
        });

        vscode.window.showInformationMessage('コミットメッセージを保存するとコミットが実行されます。',
            { modal: false }
        );
    });

    if (confirmed) {
        const commitText = fs.readFileSync(commitMsgPath, 'utf8')
            .split('\n')
            .filter(line => line.trim() && !line.startsWith('#'))
            .join('\n')
            .trim();
        
        if (!commitText) {
            vscode.window.showErrorMessage('コミットメッセージが空です。');
            return;
        }

        exec(
            `git add ${updatedFiles.map(f => `"${f}"`).join(' ')} && git commit -F .git/COMMIT_EDITMSG`,
            { cwd: root },
            (error: any, stdout: string, stderr: string) => {
                if (error) {
                    vscode.window.showErrorMessage(`コミットに失敗しました: ${stderr}`);
                } else {
                    vscode.window.showInformationMessage('コミットが完了しました');
                }
            }
        );
    }
}

export async function insertImageToArticle() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('エディタが開かれていません。');
        return;
    }

    const articlePath = editor.document.fileName;
    const articleFileName = path.basename(articlePath, '.md');

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('ワークスペースが開かれていません。');
        return;
    }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;

    const imageDir = path.join(workspaceRoot, 'docs', 'contents', 'img', articleFileName);
    if (!fs.existsSync(imageDir)) {
        fs.mkdirSync(imageDir, { recursive: true });
    }

    const fileUris = await vscode.window.showOpenDialog({
        canSelectMany: false,
        openLabel: '画像を選択',
        filters: {
            'Images': ['png', 'jpg', 'jpeg', 'gif', 'svg']
        }
    });

    if (!fileUris || fileUris.length === 0) {
        vscode.window.showErrorMessage('画像が選択されていません。');
        return;
    }

    const originalPath = fileUris[0].fsPath;
    const ext = path.extname(originalPath);
    let index = 1;
    let targetFileName = `img${index}${ext}`;
    while (fs.existsSync(path.join(imageDir, targetFileName))) {
        index++;
        targetFileName = `img${index}${ext}`;
    }

    const targetFilePath = path.join(imageDir, targetFileName);
    fs.copyFileSync(originalPath, targetFilePath);

    const markdownImage = `![img${index}](./img/${articleFileName}/${targetFileName})`;

    editor.edit(editBuilder => {
        editBuilder.insert(editor.selection.active, markdownImage);
    });

    vscode.window.showInformationMessage(`画像 ${targetFileName} を挿入しました。`);
}

async function createArticleTemplate() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('ワークスペースが開かれていません。');
        return;
    }
    const root = workspaceFolders[0].uri.fsPath;

    const title = await vscode.window.showInputBox({
        prompt: '記事のタイトルを入力してください',
        ignoreFocusOut: true,
    });
    if (!title) {
        vscode.window.showErrorMessage('タイトルが未入力のため中止します。');
        return; 
    }

    const author = await vscode.window.showInputBox({
        prompt: '著者名を入力してください',
        ignoreFocusOut: true
    });
    if (!author) {
        vscode.window.showErrorMessage('著者名が未入力のため中止します。');
        return;
    }
    
    const filename = await vscode.window.showInputBox({
        prompt: 'ファイル名(英数字・ハイフン・アンダーバーのみ)を入力してください(拡張子は自動生成されます)',
        ignoreFocusOut: true,
        placeHolder: 'example-article'
    });
    if (!filename || !/^[a-zA-Z0-9_-]+$/.test(filename)) {
        vscode.window.showErrorMessage('ファイル名が不正です。英数字、ハイフン、アンダーバーのみを使用してください。');
        return;
    }

    const tagInput = await vscode.window.showInputBox({
        prompt: 'タグ(スペース区切り, 空欄可)',
        ignoreFocusOut: true,
        placeHolder: 'tag1 tag2 tag3'
    });
    const tags = tagInput ? tagInput.trim().split(/\s+/) : [];

    const today = new Date().toISOString().slice(0, 10);

    const frontmatter = [
        `---`,
        `title: ${title}`,
        `author: ${author}`,
        `date: ${today}`,
        `lastmod: ${today}`,
        `tags: [${tags.map(tag => `${tag}`).join(', ')}]`,
        `---`,
        ``,
        `本文をここに記述してください。`,
        ``
    ].join('\n');

    const contentPath = path.join(root, 'docs', 'contents', `${filename}.md`);
    await fs.promises.mkdir(path.dirname(contentPath), { recursive: true });
    await fs.promises.writeFile(contentPath, frontmatter, 'utf8');

    const tagDir = path.join(root, 'docs', 'tags');
    await fs.promises.mkdir(tagDir, { recursive: true });

    for (const tag of tags) {
        const tagFilePath = path.join(tagDir, `${tag}.md`);
        await fs.promises.writeFile(
            tagFilePath,
             `---\nlayout: tag\ntitle: ${tag}\ntag: ${tag}\n---\n`, 
             'utf8'
        );
    }

    vscode.window.showInformationMessage(`記事 "${title}" が作成されました: ${contentPath}`);
}  

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.createArticleTemplate', createArticleTemplate)
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.insertImageToArticle', insertImageToArticle)
    );
}