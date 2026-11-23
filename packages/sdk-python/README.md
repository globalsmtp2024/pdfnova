# pdfnova

```bash
pip install pdfnova
export PDFNOVA_API_KEY=pnk_your_key
pdfnova run compress report.pdf -o out
```

```python
from pdfnova import Client

with Client("pnk_your_key") as client:
    print(client.run("rotate", ["report.pdf"], {"angle": 90}, "out"))
```

Verify webhooks with `pdfnova.verify_signature(secret, header, raw_body)`.
