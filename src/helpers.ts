export class Block {
    header: string;
    body?: Block[];
    footer?: string;

    constructor(header: string, body?: Block[], footer?: string) {
        this.header = header;
        this.body = body;
        this.footer = footer;
    }

    static line(line: string) {
        return new Block(line);
    }

    static prefix(prefix: string, block: Block) {
        return new Block(prefix + block.header, block.body, block.footer);
    }

    static suffix(block: Block, suffix: string): Block {
        if (block.footer) {
            return new Block(block.header, block.body, (block.footer || '') + suffix);
        } else if (block.body && block.body.length > 0) {
            return new Block(block.header, [
                ...block.body.slice(0, -1),
                Block.suffix(block.body[block.body.length - 1], suffix),
            ]);
        } else {
            return new Block(block.header + suffix);
        }
    }

    static joining(header: string, blocks: Block[], joiner: string, footer?: string) {
        return new Block(
            header,
            blocks.map((block, i) =>
                i === blocks.length - 1 ? block : Block.suffix(block, joiner),
            ),
            footer,
        );
    }

    toLines(indentation = '    '): string[] {
        return [
            this.header,
            ...(this.body
                ? this.body.flatMap((block) =>
                      block.toLines(indentation).map((line) => indentation + line),
                  )
                : []),
            ...(this.footer ? [this.footer] : []),
        ];
    }

    toString() {
        return this.toLines().join('\n');
    }
}

export function toFirstLowerCase(s: string) {
    return s[0].toLowerCase() + s.slice(1);
}

import path from 'path';

export function relativeImportPath(importingFile: string, importedFile: string) {
    let relative = path.relative(path.dirname(importingFile), importedFile);
    if (!relative.includes('/')) relative = './' + relative;
    if (relative.endsWith('.ts')) relative = relative.slice(0, -3);
    return relative;
}
