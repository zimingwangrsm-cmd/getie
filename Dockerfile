FROM python:3.12-slim
WORKDIR /app
COPY . /app
ENV PORT=8000
EXPOSE 8000
VOLUME ["/app/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD python3 -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:'+os.environ['PORT']+'/api/health',timeout=4)"
CMD ["python3", "server.py"]
