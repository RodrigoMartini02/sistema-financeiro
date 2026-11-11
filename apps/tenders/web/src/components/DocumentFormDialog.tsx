import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { ExternalLink, Paperclip } from 'lucide-react';
import { Button } from '@ui/components/button';
import { IsoDateField } from '@ui/components/DateField';
import { Dialog } from '@ui/components/dialog';
import { Field, Input, Select, inputBase } from '@ui/components/form';
import { InfoBanner } from '@ui/components/InfoBanner';
import { useCreateVaultDocument, useUpdateVaultDocument } from '../hooks/useVault';
import type { DocumentOwner, DocumentTypeInfo, VaultDocument, VaultPerson } from '../types';
import {
  DOCUMENT_FILE_ACCEPT,
  EMPTY_DOCUMENT_FORM,
  MAX_DOCUMENT_DESCRIPTION_LENGTH,
  buildDocumentChanges,
  buildNewDocument,
  documentFormFrom,
  fileSizeText,
  findDocumentTypeInfo,
  readFileAsDataUrl,
  suggestedValidUntil,
  typesOfOwner,
  validateDocumentFile,
  validateDocumentForm,
  type DocumentFormErrors,
  type DocumentFormValues,
} from '../utils/vault';

// Guardar um documento no cofre ou editá-lo. Guardar: o tipo (da empresa ou de pessoa, conforme onde se abriu), a pessoa (tipos
// de pessoa), a descrição (obrigatória nos tipos genéricos), a emissão, a validade (obrigatória nos tipos que vencem; sugerida a
// partir da emissão, para a pessoa conferir no documento) e o arquivo. Editar: as datas, a descrição e, se quiser, o arquivo;
// o tipo e a pessoa não mudam. O arquivo vai à API como data URL e a API confere de novo tudo o que aqui se confere.

export type DocumentFormTarget =
  | { mode: 'create'; owner: DocumentOwner; /** Pessoa já escolhida (aberto pelo cartão da pessoa); sem ela, a pessoa escolhe. */ personId?: number }
  | { mode: 'edit'; document: VaultDocument };

interface DocumentFormDialogProps {
  target: DocumentFormTarget | null;
  types: readonly DocumentTypeInfo[] | undefined;
  /** As pessoas da conta (só o titular as tem), para escolher o dono dos documentos de pessoa. */
  people: readonly VaultPerson[];
  /** Sem R2 configurado, enviar arquivo fica indisponível. */
  storageAvailable: boolean;
  onClose: () => void;
}

export function DocumentFormDialog({ target, types, people, storageAvailable, onClose }: DocumentFormDialogProps) {
  const editing = target?.mode === 'edit';
  const title = !target ? '' : editing ? 'Editar documento' : target.owner === 'PESSOA' ? 'Guardar documento da pessoa' : 'Guardar documento da empresa';
  return (
    <Dialog
      open={target !== null}
      title={title}
      description={editing ? undefined : 'O arquivo fica guardado com segurança e abre por um link de vida curta.'}
      onClose={onClose}
      size="card"
    >
      {target && (
        <DocumentForm
          // O formulário nasce de novo a cada abertura e a cada documento: o estado dos campos não vaza de um para outro.
          key={target.mode === 'edit' ? target.document.id : `new-${target.owner}-${target.personId ?? ''}`}
          target={target}
          types={types}
          people={people}
          storageAvailable={storageAvailable}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}

function initialValues(target: DocumentFormTarget): DocumentFormValues {
  if (target.mode === 'edit') return documentFormFrom(target.document);
  return { ...EMPTY_DOCUMENT_FORM, personId: target.personId === undefined ? '' : String(target.personId) };
}

interface DocumentFormProps extends Omit<DocumentFormDialogProps, 'target'> {
  target: DocumentFormTarget;
}

function DocumentForm({ target, types, people, storageAvailable, onClose }: DocumentFormProps) {
  const create = useCreateVaultDocument();
  const update = useUpdateVaultDocument();
  const mode = target.mode;
  const owner: DocumentOwner = target.mode === 'edit' ? (findDocumentTypeInfo(types, target.document.type)?.owner ?? 'EMPRESA') : target.owner;
  const fileInput = useRef<HTMLInputElement>(null);
  const [values, setValues] = useState<DocumentFormValues>(() => initialValues(target));
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<DocumentFormErrors>({});
  const [reading, setReading] = useState(false);
  // A validade sugerida só vale enquanto a pessoa não a escreveu: depois, o que ela digitou não é trocado.
  const [validityTyped, setValidityTyped] = useState(mode === 'edit');

  const type = findDocumentTypeInfo(types, values.type);
  const saving = reading || create.isPending || update.isPending;
  const submitError = (create.error ?? update.error)?.message ?? null;
  const fixedPerson = target.mode === 'create' && target.personId !== undefined;

  const withSuggestion = (next: DocumentFormValues): DocumentFormValues => {
    if (validityTyped) return next;
    const suggestion = suggestedValidUntil(next.issuedOn, findDocumentTypeInfo(types, next.type));
    return { ...next, validUntil: suggestion ?? '' };
  };

  const setField = <K extends keyof DocumentFormValues>(field: K, value: DocumentFormValues[K]) => {
    setValues((current) => (field === 'issuedOn' || field === 'type' ? withSuggestion({ ...current, [field]: value }) : { ...current, [field]: value }));
  };

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0] ?? null;
    setFile(picked);
    setErrors((current) => ({ ...current, file: picked ? (validateDocumentFile(picked) ?? undefined) : undefined }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = validateDocumentForm(values, file, types, mode);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    let upload: { name: string; data: string } | null = null;
    if (file) {
      setReading(true);
      try {
        upload = { name: file.name, data: await readFileAsDataUrl(file) };
      } catch (error) {
        setErrors({ file: error instanceof Error ? error.message : 'Não foi possível ler o arquivo' });
        return;
      } finally {
        setReading(false);
      }
    }
    if (target.mode === 'edit') {
      update.mutate({ id: target.document.id, changes: buildDocumentChanges(values, upload) }, { onSuccess: onClose });
      return;
    }
    if (upload) create.mutate(buildNewDocument(values, upload, types), { onSuccess: onClose });
  };

  const typeOptions = typesOfOwner(types, owner);
  const personalWithoutPeople = owner === 'PESSOA' && people.length === 0;
  const fileBlocked = !storageAvailable && (mode === 'create' || file !== null);

  return (
    <form className="grid gap-3.5" onSubmit={(event) => void handleSubmit(event)} noValidate>
      {!storageAvailable && (
        <InfoBanner variant="warn">O envio de arquivos está indisponível agora. Tente de novo mais tarde.</InfoBanner>
      )}

      <Field label="Tipo de documento" required error={errors.type}>
        {mode === 'edit' ? (
          <Input aria-label="Tipo de documento" value={type?.name ?? values.type} readOnly disabled />
        ) : (
          <Select aria-label="Tipo de documento" value={values.type} onChange={(event) => setField('type', event.target.value)} autoFocus>
            <option value="">Escolha o tipo</option>
            {typeOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
        )}
      </Field>

      {owner === 'PESSOA' && mode === 'create' && (
        <Field
          label="Pessoa"
          required
          error={errors.personId}
          hint={personalWithoutPeople ? 'Cadastre a pessoa na aba Pessoas antes de guardar o documento dela.' : undefined}
        >
          <Select
            aria-label="Pessoa"
            value={values.personId}
            onChange={(event) => setField('personId', event.target.value)}
            disabled={fixedPerson || personalWithoutPeople}
          >
            <option value="">Escolha a pessoa</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </Select>
        </Field>
      )}

      {type && (
        <>
          <Field
            label="Descrição"
            required={type.descriptionRequired}
            error={errors.description}
            hint={type.descriptionRequired ? 'Diga do que se trata.' : 'Opcional. Ajuda a distinguir documentos do mesmo tipo.'}
          >
            <Input
              aria-label="Descrição"
              value={values.description}
              onChange={(event) => setField('description', event.target.value)}
              maxLength={MAX_DOCUMENT_DESCRIPTION_LENGTH}
              placeholder={type.descriptionRequired ? 'Ex.: Alvará de funcionamento' : 'Ex.: Filial Centro'}
            />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Emitido em" error={errors.issuedOn}>
              <IsoDateField label="Emitido em" value={values.issuedOn} onChange={(iso) => setField('issuedOn', iso)} inputClassName={inputBase} height={32} />
            </Field>
            <Field
              label="Válido até"
              required={type.validityRequired}
              error={errors.validUntil}
              hint={
                type.defaultValidityDays !== null
                  ? `Sugestão: ${type.defaultValidityDays} dias após a emissão. Confira a validade no documento.`
                  : type.validityRequired
                    ? undefined
                    : 'Deixe em branco se o documento não vence.'
              }
            >
              <IsoDateField
                label="Válido até"
                value={values.validUntil}
                onChange={(iso) => {
                  setValidityTyped(true);
                  setField('validUntil', iso);
                }}
                inputClassName={inputBase}
                height={32}
              />
            </Field>
          </div>

          {type.issuerUrl && (
            <a
              href={type.issuerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-fit items-center gap-1.5 rounded text-xs font-semibold text-brand-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 dark:text-brand-300"
            >
              <ExternalLink size={13} aria-hidden="true" />
              Emitir este documento no site do órgão
            </a>
          )}
        </>
      )}

      <Field
        label={mode === 'edit' ? 'Arquivo' : 'Arquivo do documento'}
        required={mode === 'create'}
        error={errors.file}
        hint={
          mode === 'edit'
            ? `Arquivo atual: ${target.mode === 'edit' ? `${target.document.fileName} (${fileSizeText(target.document.fileSize)})` : ''}. Escolha outro só se quiser trocá-lo.`
            : 'PDF, JPG ou PNG, até 10 MB.'
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInput}
            type="file"
            accept={DOCUMENT_FILE_ACCEPT}
            onChange={handleFile}
            aria-label="Arquivo do documento"
            className="sr-only"
            tabIndex={-1}
          />
          <Button type="button" variant="secondary" size="sm" onClick={() => fileInput.current?.click()} icon={<Paperclip size={14} aria-hidden="true" />}>
            {file ? 'Trocar o arquivo escolhido' : mode === 'edit' ? 'Escolher outro arquivo' : 'Escolher arquivo'}
          </Button>
          {file && (
            <span className="min-w-0 break-all text-[12px] text-slate-600 dark:text-slate-300">
              {file.name} ({fileSizeText(file.size)})
            </span>
          )}
        </div>
      </Field>

      {submitError && (
        <p role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">
          {submitError}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={saving || fileBlocked || (mode === 'create' && personalWithoutPeople)}>
          {saving ? (reading ? 'Lendo o arquivo…' : 'Salvando…') : mode === 'create' ? 'Guardar' : 'Salvar'}
        </Button>
      </div>
    </form>
  );
}
