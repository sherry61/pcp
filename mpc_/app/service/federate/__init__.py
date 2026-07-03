from flask import Blueprint

fl_bp = Blueprint('federate_learning', __name__)

from . import routes