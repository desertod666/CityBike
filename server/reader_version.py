"""Minimum compatible firmware versions; capability/API checks remain mandatory."""
import re


def version_at_least(value,minimum):
    if not all(isinstance(x,str) and re.fullmatch(r'\d{1,3}\.\d{1,3}\.\d{1,3}',x) for x in (value,minimum)):
        return False
    return tuple(map(int,value.split('.'))) >= tuple(map(int,minimum.split('.')))
