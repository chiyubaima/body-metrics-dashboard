import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Load the real recipe preview in component tests without a browser or bundler.
const source = ts
  .transpileModule(
    readFileSync(new URL('../app/dish-details.tsx', import.meta.url), 'utf8'),
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
    (_match, _quote, name: string) =>
      `from ${JSON.stringify(import.meta.resolve(name))}`,
  );
export const dishDetailsModule =
  'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
