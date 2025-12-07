import handler from "../dist/server/server.js";

export default async function (req, res) {
  try {
    const protocol = req.headers['x-forwarded-proto'] || 'https'
    const host = req.headers.host || req.headers['x-forwarded-host'] || 'localhost'
    const url = new URL(req.url, `${protocol}://${host}`)

    let body = undefined
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (req.body) {
        body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
      } else {
        body = undefined
      }
    }

    const request = new Request(url.toString(), {
      method: req.method,
      headers: req.headers,
      body: body,
    })

    const response = await handler.fetch(request)

    response.headers.forEach((value, key) => {  
      if (key.toLowerCase() !== 'content-encoding') {
        res.setHeader(key, value)
      }
    })

    res.status(response.status)

    if (response.body) {
      const reader = response.body.getReader()
      const stream = new ReadableStream({
        async start(controller) {
          try {
            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              controller.enqueue(value)
            }
            controller.close()
          } catch (error) {
            controller.error(error)
          }
        },
      })
      
      const chunks = []
      for await (const chunk of stream) {
        chunks.push(chunk)
      }
      const buffer = Buffer.concat(chunks)
      res.send(buffer)
    } else {
      const text = await response.text()
      res.send(text)
    }
  } catch (error) {
    console.error("Error handling request:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}