import { test } from "node:test";
import assert from "node:assert/strict";
import { dbConfig } from "../lib/db-config";
test('pool respects the configured low connection limit',()=>{
 const saved={DATABASE_URL:process.env.DATABASE_URL,DB_POOL_MAX:process.env.DB_POOL_MAX};
 try { process.env.DATABASE_URL='postgres://test@127.0.0.1/test';process.env.DB_POOL_MAX='2';assert.equal(dbConfig().max,2);process.env.DB_POOL_MAX='100';assert.equal(dbConfig().max,5); }
 finally { for(const[key,value]of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value;} }
});
test("external databases require verified TLS and reject CA override", () => {
  const old = process.env.DATABASE_URL,
    ca = process.env.DATABASE_CA_BASE64;
  try {
    delete process.env.DATABASE_CA_BASE64;
    process.env.DATABASE_URL = "postgres://test@db.example.invalid/test";
    assert.throws(() => dbConfig(), /TLS/);
    process.env.DATABASE_URL += "?sslmode=verify-full";
    assert.ok(dbConfig().connectionString);
    process.env.DATABASE_CA_BASE64 = Buffer.from("test-ca").toString("base64");
    assert.throws(() => dbConfig(), /override/);
    process.env.DATABASE_URL = "postgres://test@db.example.invalid/test";
    assert.equal(
      (dbConfig().ssl as { rejectUnauthorized: boolean }).rejectUnauthorized,
      true,
    );
    process.env.DATABASE_URL = "postgres://test@127.0.0.1/test";
    delete process.env.DATABASE_CA_BASE64;
    assert.equal(dbConfig().ssl, undefined);
  } finally {
    if (old === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = old;
    if (ca === undefined) delete process.env.DATABASE_CA_BASE64;
    else process.env.DATABASE_CA_BASE64 = ca;
  }
});

test('proxy TLS identity still rejects certificates for another server', () => {
  const saved = { url: process.env.DATABASE_URL, ca: process.env.DATABASE_CA_BASE64, name: process.env.DATABASE_TLS_SERVERNAME };
  try {
    process.env.DATABASE_URL = 'postgres://test@proxy.example.invalid/test';
    process.env.DATABASE_TLS_SERVERNAME = 'postgres.railway.internal';
    delete process.env.DATABASE_CA_BASE64;
    assert.throws(() => dbConfig(), /trusted CA/);
    process.env.DATABASE_CA_BASE64 = Buffer.from('test-ca').toString('base64');
    const ssl = dbConfig().ssl as import('node:tls').ConnectionOptions;
    assert.equal(ssl.rejectUnauthorized, true);
    const valid = { subjectaltname: 'DNS:postgres.railway.internal', subject: { CN: 'localhost' } } as import('node:tls').PeerCertificate;
    assert.equal(ssl.checkServerIdentity!('proxy.example.invalid', valid), undefined);
    const invalid = { subjectaltname: 'DNS:other.example.invalid', subject: { CN: 'other.example.invalid' } } as import('node:tls').PeerCertificate;
    assert.ok(ssl.checkServerIdentity!('proxy.example.invalid', invalid) instanceof Error);
  } finally {
    for (const [key, value] of Object.entries({DATABASE_URL:saved.url,DATABASE_CA_BASE64:saved.ca,DATABASE_TLS_SERVERNAME:saved.name})) {
      if (value === undefined) delete process.env[key]; else process.env[key]=value;
    }
  }
});
