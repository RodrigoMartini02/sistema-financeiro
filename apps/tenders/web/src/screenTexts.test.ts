import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

// Telas do módulo sem a marca da fonte dos dados (plano
// .plans/licitacoes-base-nacional.md, parte 7): nenhum texto visível cita o
// PNCP. A fonte fica nos Termos e na Privacidade (src/screens/public). Nomes de
// código (pncpLink, NotOnPncp, PNCP_DAY) e comentários não contam, e os
// endereços (pncp.gov.br) ficam nos links ao documento original.

const MODULE_DIR = __dirname;
/** "PNCP" como palavra solta, fora de um nome de código. */
const SOURCE_BRAND = /(?<![A-Za-z0-9_])PNCP(?![A-Za-z0-9_])/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      return sourceFiles(full);
    }
    return /\.(ts|tsx)$/.test(name) && !name.endsWith('.test.ts') ? [full] : [];
  });
}

/** O código sem os comentários de bloco e de linha (o "//" de um endereço fica). */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

test('telas do módulo: nenhum texto visível cita o PNCP', () => {
  const offenders: string[] = [];
  for (const file of sourceFiles(MODULE_DIR)) {
    withoutComments(readFileSync(file, 'utf8'))
      .split('\n')
      .forEach((line, index) => {
        if (SOURCE_BRAND.test(line)) {
          offenders.push(`${path.relative(MODULE_DIR, file)}:${index + 1}: ${line.trim()}`);
        }
      });
  }
  assert.deepEqual(offenders, []);
});

test('a varredura acha a marca em texto e ignora nomes de código e comentários', () => {
  assert.ok(SOURCE_BRAND.test(withoutComments("const label = 'Abrir no PNCP';")));
  assert.ok(SOURCE_BRAND.test(withoutComments('<span>Controle PNCP</span>')));
  assert.ok(!SOURCE_BRAND.test(withoutComments('const PNCP_DAY = /x/; // dia do PNCP')));
  assert.ok(!SOURCE_BRAND.test(withoutComments('notice.pncpLink && <NotOnPncp numeroControlePNCP={x} />')));
  assert.ok(!SOURCE_BRAND.test(withoutComments("const url = 'https://pncp.gov.br/app';")));
});
