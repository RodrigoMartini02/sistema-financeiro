import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import type { DemoFakeDatabase } from './demoFakeDatabase';
import { createDemoDatabaseInstance, resolveFakeApiRequest, type FakeApiRequestInit } from './fakeApiResolver';

const DemoModeContext = createContext<true | null>(null);

// Referência de módulo lida por apiRequest (fora da árvore React) para decidir se uma
// requisição deve ser desviada para o banco fake. É setada/limpa estritamente pelo ciclo
// de vida do DemoModeProvider (montagem/desmontagem) para nunca vazar fora do contexto demo.
let activeDemoResolver: ((endpoint: string, init?: FakeApiRequestInit) => unknown) | null = null;

export function isDemoModeActive(): boolean {
  return activeDemoResolver !== null;
}

export function resolveDemoRequest(endpoint: string, init?: FakeApiRequestInit): unknown {
  if (!activeDemoResolver) {
    throw new Error('Nenhum contexto de demonstração ativo');
  }
  return activeDemoResolver(endpoint, init);
}

export function DemoModeProvider({ children }: { children: ReactNode }) {
  const dbRef = useRef<DemoFakeDatabase>(createDemoDatabaseInstance());
  const resolve = (endpoint: string, init?: FakeApiRequestInit) =>
    resolveFakeApiRequest(dbRef.current, endpoint, init);

  // Setado de forma síncrona durante a renderização (não em useEffect) para que apiRequest
  // já veja o modo demo ativo mesmo em queries disparadas na primeira montagem, antes de
  // qualquer efeito rodar. O useEffect cuida apenas de limpar a referência ao desmontar.
  activeDemoResolver = resolve;

  useEffect(() => {
    return () => {
      activeDemoResolver = null;
    };
  }, []);

  return (
    <DemoModeContext.Provider value={true}>
      {children}
    </DemoModeContext.Provider>
  );
}

export function useDemoMode() {
  return useContext(DemoModeContext);
}
