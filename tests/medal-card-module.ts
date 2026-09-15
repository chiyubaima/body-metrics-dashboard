import { readFileSync } from 'node:fs';
import ts from 'typescript';
const dataUrl = (code: string) =>
  'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const imageStub = dataUrl(
  `import {createElement} from ${JSON.stringify(import.meta.resolve('react'))};export default function Image({unoptimized,...props}){return createElement('img',props);}`,
);
export const medalCardModule = dataUrl(
  ts
    .transpileModule(
      readFileSync(new URL('../app/medal-card.tsx', import.meta.url), 'utf8'),
      {
        compilerOptions: {
          jsx: ts.JsxEmit.ReactJSX,
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
        },
      },
    )
    .outputText.replace(
      /from (["'])([^"']+)\1/g,
      (_m, _q, name: string) =>
        `from ${JSON.stringify(name === 'next/image' ? imageStub : name.startsWith('@/lib/') ? new URL('../lib/' + name.slice(6) + '.ts', import.meta.url).href : import.meta.resolve(name))}`,
    ),
);
