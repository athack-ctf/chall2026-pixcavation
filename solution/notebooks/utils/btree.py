import json


class Leaf:
    def __init__(self, ch):
        self.value = ch  # character

    def is_leaf(self):
        return True

    def to_dict(self):
        return {"type": "leaf", "value": self.value}


class Node:
    def __init__(self, xy, left, right):
        if left is None or right is None:
            raise ValueError("Node must have both left and right children")
        self.value = xy  # (x, y)
        self.left = left
        self.right = right

    def is_leaf(self):
        return False

    def to_dict(self):
        return {
            "type": "node",
            "value": list(self.value),  # (x, y) -> [x, y]
            "left": self.left.to_dict(),
            "right": self.right.to_dict(),
        }


def leaf(ch):
    return Leaf(ch)


def node(xy, left, right):
    return Node(xy, left, right)


def print_btree(t, indent=0):
    pad = "  " * indent
    if t.is_leaf():
        print(f"{pad}Leaf({t.value})")
    else:
        print(f"{pad}Node{t.value}")
        print_btree(t.left, indent + 1)
        print_btree(t.right, indent + 1)


def serialize_btree(btree):
    if isinstance(btree, Leaf):
        return {
            "type": "leaf",
            "value": btree.value
        }

    if isinstance(btree, Node):
        return {
            "type": "node",
            "value": list(btree.value),  # (x, y) → [x, y]
            "left": serialize_btree(btree.left),
            "right": serialize_btree(btree.right)
        }

    raise TypeError(f"Unknown btree node: {type(btree)}")


def deserialize_btree(data):
    node_type = data["type"]

    if node_type == "leaf":
        return Leaf(data["value"])

    if node_type == "node":
        xy = tuple(data["value"])
        left = deserialize_btree(data["left"])
        right = deserialize_btree(data["right"])
        return Node(xy, left, right)

    raise ValueError(f"Unknown btree node type: {node_type}")


def save_btree_json(btree, filename):
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(serialize_btree(btree), f, indent=2)


def load_btree_json(filename):
    with open(filename, "r", encoding="utf-8") as f:
        return deserialize_btree(json.load(f))
