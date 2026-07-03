from flask import Blueprint

he_bp = Blueprint('homomorphic_encryption', __name__)

from . import routes