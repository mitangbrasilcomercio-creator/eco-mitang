const { Client } = require('pg');
require('dotenv').config();

async function test() {
  console.log('Testando conexao direta com o Supabase...');
  const directUrl = process.env.DIRECT_URL;
  const client = new Client({
    connectionString: directUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('CONEXAO COM SUPABASE ESTABELECIDA COM SUCESSO!');
    const res = await client.query('SELECT version(), current_database(), current_user;');
    console.log('Versao PostgreSQL:', res.rows[0].version);
    console.log('Banco de Dados   :', res.rows[0].current_database);
    console.log('Usuario Conectado:', res.rows[0].current_user);
    await client.end();
  } catch (err) {
    console.error('Falha na conexao:', err.message);
    process.exit(1);
  }
}

test();
