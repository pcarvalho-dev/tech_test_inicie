import dataSource from '../data-source';
import { seed } from './seed';

async function run() {
  await dataSource.initialize();
  await seed(dataSource);
  await dataSource.destroy();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
