from flask import Flask

from app.service.homomorphic import he_bp
from app.service.re_encrypt import pre_bp
from app.service.task import task_bp

app=Flask(__name__)

app.register_blueprint(he_bp, url_prefix="/he")
app.register_blueprint(pre_bp, url_prefix="/pre")
app.register_blueprint(task_bp, url_prefix="/api/v1")