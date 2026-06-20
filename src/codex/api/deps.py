from typing import Annotated

from fastapi import Depends

from codex.core.config import Settings, get_settings

Settings_Dep = Annotated[Settings, Depends(get_settings)]