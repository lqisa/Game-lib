import { knex } from '../database/db.js';
import { fetchDLSiteDetail } from '../scraper/dlsite.js';
import { fetchBangumiDetail } from '../scraper/bangumi.js';
import { fetchVNDBDetail } from '../scraper/vndb.js';

const CONCURRENCY = 3;

const pLimit = (concurrency) => {
  let running = 0;
  const queue = [];
  const next = () => {
    if (queue.length === 0 || running >= concurrency) return;
    running++;
    const { fn, resolve, reject } = queue.shift();
    fn()
      .then(resolve, reject)
      .finally(() => {
        running--;
        next();
      });
  };
  return (fn) =>
    new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
};

const main = async () => {
  const bangumiToken =
    (await knex('setting').where({ key: 'bangumi_token' }).first())?.value || '';

  const sources = await knex('game_source')
    .whereNull('name')
    .select('id', 'source_type', 'source_id');

  console.log(`Found ${sources.length} sources without name`);

  if (sources.length === 0) {
    console.log('Nothing to backfill.');
    await knex.destroy();
    return;
  }

  const limit = pLimit(CONCURRENCY);
  let done = 0;
  let errors = 0;

  await Promise.all(
    sources.map((s) =>
      limit(async () => {
        try {
          let name = null;
          if (s.source_type === 'dlsite') {
            const detail = await fetchDLSiteDetail(s.source_id);
            name = detail?.title || null;
          } else if (s.source_type === 'bangumi') {
            const detail = await fetchBangumiDetail(s.source_id, bangumiToken);
            name = detail?.title || null;
          } else if (s.source_type === 'vndb') {
            const detail = await fetchVNDBDetail(s.source_id);
            name = detail?.title || null;
          }
          if (name) {
            await knex('game_source').where({ id: s.id }).update({ name });
          }
          done++;
          if (done % 10 === 0) console.log(`Progress: ${done}/${sources.length}`);
        } catch (err) {
          errors++;
          console.error(`Failed for ${s.source_type}:${s.source_id}: ${err.message}`);
        }
      }),
    ),
  );

  console.log(`Done. ${done} updated, ${errors} errors.`);
  await knex.destroy();
};

main().catch((err) => {
  console.error(err);
  knex.destroy().then(() => process.exit(1));
});