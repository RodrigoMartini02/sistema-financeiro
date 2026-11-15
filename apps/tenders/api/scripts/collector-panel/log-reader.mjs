// Leitura do log da rotina diária. O log de uma rodada de ~11 h em nível debug pode passar de dezenas de MB, e a tela
// consulta a cada poucos segundos: o resumo é atualizado só com os bytes novos desde a última leitura.
import { open, readdir } from 'node:fs/promises';
import path from 'node:path';
import { applyLogLine, createLogSummary, parseLogLine, pickLatestDailyLog, splitCompleteLines, tailLines } from './logic.mjs';

const READ_CHUNK_BYTES = 4 * 1024 * 1024;
const TAIL_BYTES = 256 * 1024;

export function createLogReader(logDirectory) {
  // Resumo em construção do log mais recente: { file, offset, summary }.
  let tracked = null;
  let pendingSummary = null;

  async function findLatestLogName() {
    try {
      return pickLatestDailyLog(await readdir(logDirectory));
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async function readSummaryOnce() {
    const file = await findLatestLogName();
    if (file === null) {
      tracked = null;
      return null;
    }
    const handle = await open(path.join(logDirectory, file), 'r');
    try {
      const { size } = await handle.stat();
      if (tracked === null || tracked.file !== file || size < tracked.offset) {
        tracked = { file, offset: 0, summary: createLogSummary() };
      }
      while (tracked.offset < size) {
        const buffer = Buffer.alloc(Math.min(READ_CHUNK_BYTES, size - tracked.offset));
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, tracked.offset);
        const { lines, consumedBytes } = splitCompleteLines(buffer.subarray(0, bytesRead));
        for (const line of lines) {
          applyLogLine(tracked.summary, line);
        }
        if (consumedBytes > 0) {
          tracked.offset += consumedBytes;
        } else if (bytesRead < READ_CHUNK_BYTES) {
          break; // linha ainda sendo escrita: entra na próxima consulta
        } else {
          tracked.offset += bytesRead; // linha maior que o pedaço lido: pula em vez de repetir para sempre
        }
      }
      return { file, summary: tracked.summary };
    } finally {
      await handle.close();
    }
  }

  return {
    /** Resumo do log mais recente, ou null se ainda não há log. Chamadas simultâneas compartilham a mesma leitura. */
    readSummary() {
      pendingSummary ??= readSummaryOnce().finally(() => {
        pendingSummary = null;
      });
      return pendingSummary;
    },

    /** Últimas `count` linhas do log mais recente, já em { time, level, text }. */
    async readTail(count) {
      const file = await findLatestLogName();
      if (file === null) {
        return { file: null, entries: [] };
      }
      const handle = await open(path.join(logDirectory, file), 'r');
      try {
        const { size } = await handle.stat();
        const start = Math.max(0, size - TAIL_BYTES);
        const buffer = Buffer.alloc(size - start);
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, start);
        const lines = tailLines(buffer.subarray(0, bytesRead), count, start === 0);
        return { file, entries: lines.map(parseLogLine) };
      } finally {
        await handle.close();
      }
    },
  };
}
