import { pool } from '../db/client';
import { CATEGORY_KEYWORDS, inferCategory } from '../utils/expenseNormalizer';

interface LearningEntry {
  texto: string;
  categoria: string;
  freq: number;
}

interface CategorySuggestion {
  categoria: string;
  confianca: number;
}

interface CategoryRule {
  palavras: string[];
  categoria: string;
}

function extractCategoryRulesFromText(text: string): CategoryRule[] {
  if (!text) return [];
  const rules: CategoryRule[] = [];
  const patterns = [
    /palavras?\s+como\s+([\s\S]+?)\s+deve[nm]?\s+ser\s+classificad[ao]s?\s+como\s+categor[ií]a\s+([\w\sÀ-ÿ]+?)(?:\.|,|$|\n)/gi,
    /classifique\s+([\s\S]+?)\s+como\s+(?:categor[ií]a\s+)?([\w\sÀ-ÿ]+?)(?:\.|,|$|\n)/gi,
    /([\s\S]+?)\s+s[ãa]o\s+(?:da\s+)?categor[ií]a\s+([\w\sÀ-ÿ]+?)(?:\.|,|$|\n)/gi,
    /([\s\S]+?)\s+deve[nm]?\s+ser\s+(?:da\s+)?categor[ií]a\s+([\w\sÀ-ÿ]+?)(?:\.|,|$|\n)/gi,
  ];
  for (const pattern of patterns) {
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      const rawWords = m[1]!;
      const category = m[2]!.trim().replace(/\s+/g, ' ');
      const words: string[] = [];
      const quoted = [...rawWords.matchAll(/['"""''`]([^'"""''`]+)['"""''`]/g)];
      for (const qm of quoted) words.push(qm[1]!.toLowerCase().trim());
      if (words.length === 0) {
        for (const p of rawWords.split(/,|\s+e\s+/i)) {
          const clean = p.replace(/['"""''`]/g, '').trim().toLowerCase();
          if (clean.length > 1) words.push(clean);
        }
      }
      if (words.length > 0 && category.length > 1) rules.push({ palavras: words, categoria: category });
    }
  }
  return rules;
}

export async function fetchLearning(userId: number): Promise<LearningEntry[]> {
  try {
    const result = await pool.query(
      `SELECT texto, categoria, COUNT(*) as freq
       FROM aprendizado_categoria
       WHERE usuario_id = $1
       GROUP BY texto, categoria
       ORDER BY freq DESC`,
      [userId],
    );
    return result.rows as LearningEntry[];
  } catch {
    return [];
  }
}

export async function saveLearning(userId: number, text: string, category: string): Promise<void> {
  if (!userId || !text || !category) return;
  try {
    await pool.query(
      `INSERT INTO aprendizado_categoria (usuario_id, texto, categoria) VALUES ($1, $2, $3)`,
      [userId, text.toLowerCase().trim().substring(0, 100), category],
    );
  } catch (err) {
    console.error('Save learning error:', (err as Error).message);
  }
}

export async function classifyCategory(
  description: string,
  userId: number,
  availableCategories: string[] = [],
  instructionsText = '',
): Promise<string> {
  if (!description) return 'Outros';
  const lower = description.toLowerCase();

  if (userId) {
    const learning = await fetchLearning(userId);
    const exact = learning.find((a) => lower === a.texto);
    if (exact) return exact.categoria;
    for (const item of learning) {
      if (lower.includes(item.texto) || item.texto.includes(lower)) return item.categoria;
    }
  }

  if (instructionsText) {
    const rules = extractCategoryRulesFromText(instructionsText);
    for (const rule of rules) {
      if (rule.palavras.some((p) => lower.includes(p))) return rule.categoria;
    }
  }

  const heuristic = inferCategory(description);

  if (availableCategories.length > 0) {
    const match = availableCategories.find((c) => c.toLowerCase() === heuristic.toLowerCase());
    if (match) return match;
    const close = availableCategories.find(
      (c) => c.toLowerCase().includes(heuristic.toLowerCase()) || heuristic.toLowerCase().includes(c.toLowerCase()),
    );
    if (close) return close;
    const outros = availableCategories.find((c) => /outros/i.test(c));
    return outros ?? availableCategories[0] ?? heuristic;
  }

  return heuristic;
}

export function suggestCategories(description: string): CategorySuggestion[] {
  if (!description) return [];
  const lower = description.toLowerCase();
  const scores: Record<string, number> = {};

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) score += kw.length;
    }
    if (score > 0) scores[category] = score;
  }

  return Object.entries(scores)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([cat, score]) => ({ categoria: cat, confianca: score }));
}

export async function updatePopularCategories(userId: number): Promise<Array<Record<string, unknown>>> {
  if (!userId) return [];
  try {
    const result = await pool.query(
      `SELECT categoria_id, forma_pagamento, COUNT(*) as total
       FROM despesas
       WHERE usuario_id = $1 AND categoria_id IS NOT NULL
       GROUP BY categoria_id, forma_pagamento
       ORDER BY total DESC
       LIMIT 10`,
      [userId],
    );
    return result.rows as Array<Record<string, unknown>>;
  } catch {
    return [];
  }
}
