from flask import Blueprint

pre_bp = Blueprint('proxy_re_encrypt', __name__)

from . import routes