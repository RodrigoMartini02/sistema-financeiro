/** O anexo como o servidor devolve: só os dados do arquivo, sem a chave no R2 nem o dono. */
export interface AttachmentSummary {
  id: string;
  name: string;
  contentType: string;
  size: number;
  createdAt: string;
}
