from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response


class RequestPagination(PageNumberPagination):
    """50 rows per page with an exact count, so the UI can say "1 to 50 of N"."""

    page_size = 50
    page_size_query_param = None

    def get_paginated_response(self, data):
        return Response(
            {
                "count": self.page.paginator.count,
                "page": self.page.number,
                "page_size": self.page_size,
                "results": data,
            }
        )
