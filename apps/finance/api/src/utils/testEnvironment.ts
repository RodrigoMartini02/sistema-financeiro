process.env.DATABASE_URL = 'postgres://unit:unit@127.0.0.1:1/finance_unit_test';
process.env.FINANCE_DB_TESTS = '0';
delete process.env.DOTENV_CONFIG_PATH;
