from fastapi import APIRouter, status

from narrative_mind.api.deps import AuthService_Dep
from narrative_mind.domain.user import Token, User, UserCreate, UserLogin

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/register",
    response_model=User,
    status_code=status.HTTP_201_CREATED,
)
async def register(
    payload: UserCreate,
    svc: AuthService_Dep,
) -> User:
    return await svc.register(payload)


@router.post(
    "/login",
    response_model=Token,
)
async def login(
    payload: UserLogin,
    svc: AuthService_Dep,
) -> Token:
    return await svc.login(payload)