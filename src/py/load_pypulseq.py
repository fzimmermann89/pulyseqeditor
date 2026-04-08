import os
import sys
import zipfile

PACKAGE_ROOT = "/app/python_packages"
PACKAGE_ARCHIVE = "/app/python_packages.zip"

if PACKAGE_ROOT not in sys.path:
    sys.path.insert(0, PACKAGE_ROOT)

if not os.path.isdir(os.path.join(PACKAGE_ROOT, "pypulseq")):
    os.makedirs(PACKAGE_ROOT, exist_ok=True)
    with zipfile.ZipFile(PACKAGE_ARCHIVE, "r") as archive:
        archive.extractall(PACKAGE_ROOT)
