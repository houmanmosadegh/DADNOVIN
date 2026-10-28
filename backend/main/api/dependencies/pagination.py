"""Pagination params shared by list endpoints."""

from typing import Annotated

from fastapi import Depends, Query


class PageParams:
    def __init__(
        self,
        page: Annotated[int, Query(ge=1)] = 1,
        page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    ) -> None:
        self.page = page
        self.page_size = page_size

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


PageDep = Annotated[PageParams, Depends()]
