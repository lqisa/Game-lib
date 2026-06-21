import express from 'express'
import * as db from '../database/db.js'

const router = express.Router()

router.get('/', async (req, res, next) => {
  try {
    const libraries = await db.getLibraries()
    res.send(libraries)
  } catch (err) {
    next(err)
  }
})

router.post('/', async (req, res, next) => {
  try {
    const { name, path } = req.body
    if (!name || !path) {
      return res.status(400).send({ error: 'name and path are required' })
    }
    const [id] = await db.insertLibrary({ name, path })
    const library = await db.knex('library').where({ id }).first()
    res.status(201).send(library)
  } catch (err) {
    next(err)
  }
})

router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params
    const { name, path } = req.body
    await db.updateLibrary(Number(id), { name, path })
    const library = await db.knex('library').where({ id }).first()
    res.send(library)
  } catch (err) {
    next(err)
  }
})

router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params
    await db.deleteLibrary(Number(id))
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})

export default router