const { Client } = require('pg');
require('dotenv').config();

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  await client.connect();
  
  // Get all columns and their types
  const colRes = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'memberships';
  `);
  console.log("Schema Columns:");
  console.table(colRes.rows);

  // Get raw data from memberships, cast to text to see all values without decoding errors
  const dataRes = await client.query(`
    SELECT 
      id::text, 
      user_id::text, 
      member_id::text,
      membership_campaign_id::text,
      application_id::text,
      membership_number::text,
      plan_id::text
    FROM memberships;
  `);
  console.log("Raw Memberships Data:");
  console.table(dataRes.rows);

  await client.end();
}

main().catch(console.error);
