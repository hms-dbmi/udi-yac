class Op:
    @staticmethod
    def count():
        return {"op": "count"}

    @staticmethod
    def frequency():
        return {"op": "frequency"}

    @staticmethod
    def mean(field):
        return {"op": "mean", "field": field}

    @staticmethod
    def min(field):
        return {"op": "min", "field": field}

    @staticmethod
    def max(field):
        return {"op": "max", "field": field}

    @staticmethod
    def median(field):
        return {"op": "median", "field": field}

    @staticmethod
    def sum(field):
        return {"op": "sum", "field": field}


def rolling(expression):
    return {"rolling": {"expression": expression}}
