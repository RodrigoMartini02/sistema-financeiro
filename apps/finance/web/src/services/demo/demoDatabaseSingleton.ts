import { createDemoDatabaseInstance } from './fakeApiResolver';
import type { DemoFakeDatabase } from './demoFakeDatabase';

// Uma única instância por carregamento do documento demo.html — seguro como singleton de
// módulo porque esse documento nunca é compartilhado com a Home real (é um contexto JS
// isolado, carregado apenas dentro do <iframe> da seção de demonstração).
let instance: DemoFakeDatabase | null = null;

export function getDemoDatabase(): DemoFakeDatabase {
  if (!instance) {
    instance = createDemoDatabaseInstance();
  }
  return instance;
}
