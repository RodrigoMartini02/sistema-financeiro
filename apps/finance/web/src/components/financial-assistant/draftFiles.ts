// Os arquivos da conversa do assistente viram comprovantes do lançamento que o card grava. Sem React nem rede (o envio
// chega por parâmetro), para o teste rodar direto.
import type { AssistantFile } from '../../types/financialCopilot';
import { attachmentProblem } from '../../utils/attachmentRules';

export type UploadReceipt = (ownerType: 'expense' | 'income', file: File) => Promise<{ id: string }>;

export interface DraftFilesUpload {
  /** Os ids dos comprovantes, na ordem dos arquivos. */
  ids: string[];
  /** Os arquivos que não viraram comprovante. */
  failed: string[];
}

/**
 * Sobe os arquivos da conversa como comprovantes do lançamento. A conversa lê também WebP, que comprovante de
 * lançamento não aceita: esses nem sobem. Um arquivo que não sobe não impede o lançamento (o dinheiro já foi gasto ou
 * recebido): o nome dele volta em `failed` para o assistente avisar. `uploaded` guarda o id de cada arquivo que já
 * subiu, para uma nova tentativa de salvar (porque o salvamento falhou depois) não enviar o mesmo arquivo outra vez.
 */
export async function uploadDraftFiles(
  ownerType: 'expense' | 'income',
  files: readonly AssistantFile[],
  uploaded: Map<string, string>,
  upload: UploadReceipt,
): Promise<DraftFilesUpload> {
  const ids: string[] = [];
  const failed: string[] = [];
  for (const assistantFile of files) {
    let receiptId = uploaded.get(assistantFile.id);
    if (receiptId === undefined) {
      if (attachmentProblem(ownerType, assistantFile.file) !== '') {
        failed.push(assistantFile.nome);
        continue;
      }
      try {
        receiptId = (await upload(ownerType, assistantFile.file)).id;
      } catch (uploadError) {
        console.error('Assistant file upload error:', uploadError);
        failed.push(assistantFile.nome);
        continue;
      }
      uploaded.set(assistantFile.id, receiptId);
    }
    ids.push(receiptId);
  }
  return { ids, failed };
}
