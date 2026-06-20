const express = require('express')
const router = express.Router()
const db = require('../database/db')

router.get('/', async (req, res, next) => {
  try {
    const settings = await db.getAllSettings()
    res.send(settings)
  } catch (err) {
    next(err)
  }
})

router.get('/:key', async (req, res, next) => {
  try {
    const value = await db.getSetting(req.params.key)
    if (value === null) {
      return res.status(404).send({ error: '设置项不存在' })
    }
    res.send({ key: req.params.key, value })
  } catch (err) {
    next(err)
  }
})

router.put('/:key', async (req, res, next) => {
  try {
    const { value } = req.body
    if (value === undefined) {
      return res.status(400).send({ error: 'value 为必填项' })
    }
    await db.setSetting(req.params.key, String(value))
    res.send({ key: req.params.key, value: String(value) })
  } catch (err) {
    next(err)
  }
})

router.delete('/:key', async (req, res, next) => {
  try {
    await db.knex('setting').where({ key: req.params.key }).del()
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})

module.exports = router