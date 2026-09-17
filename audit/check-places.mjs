// Executa UMA consulta real. Requer chave e pode consumir quota do Google Places.
import dotenv from 'dotenv';
import { buscarAssistencias } from '../server/googlePlaces.ts';

dotenv.config({ path: ['.env.local', '.env'], quiet: true });
try {
  const places = await buscarAssistencias();
  console.log(JSON.stringify({
    total: places.length,
    comNome: places.filter(p => p.displayName?.text).length,
    comEndereco: places.filter(p => p.formattedAddress).length,
    comTelefone: places.filter(p => p.nationalPhoneNumber).length,
    comCoordenadas: places.filter(p => p.location).length,
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ code: error.code ?? 'UNKNOWN', status: error.status, message: error.message }));
  process.exitCode = 1;
}
