# pdfnova

```js
import { Client, verifyWebhook } from "pdfnova";

const client = new Client(process.env.PDFNOVA_API_KEY);
const results = await client.run("rotate", ["report.pdf"], { angle: 90 });
```

`verifyWebhook(secret, signatureHeader, rawBody)` checks the `X-PDFNova-Signature` header.
