const express = require('express')
const app = express()
const port = 3000

app.use(express.static('./site'))

app.listen(port, () => {
  console.log(`fuckery listening on port ${port}`)
})