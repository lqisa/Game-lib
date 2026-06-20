const fs = require('fs')
const path = require('path')
const { knex } = require('./db')
const { createSchema } = require('./schema')

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'db.sqlite3')

const initDatabase = async () => {
  const dbExists = fs.existsSync(DB_PATH)

  if (!dbExists) {
    console.log(' * 数据库不存在，正在创建...')
    await createSchema()
    console.log(' * 数据库创建完成.')
  } else {
    console.log(' * 数据库已存在.')
  }
}

module.exports = { initDatabase }