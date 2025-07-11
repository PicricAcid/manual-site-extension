import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

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