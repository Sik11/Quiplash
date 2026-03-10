import requests
import json

class SmallUsernameError(ValueError):
    pass

class LargeUsernameError(ValueError):
    pass

class SmallPasswordError(ValueError):
    pass

class LargePasswordError(ValueError):
    pass

class NegativeGameCountError(ValueError):
    pass

class NegativeScoreError(ValueError):
    pass

class Player:

    def __init__(self, username="", password="", gameCount=0, score=0):
        self.username = username
        self.password = password
        self.games_played = gameCount
        self.total_score = score

    
    def __str__(self):
        """
        Returns a string representation of the player
        """
        return """
        username = {}
        password = {}
        games_played = {}
        total_score = {}
        """.format(self.username, self.password, self.games_played, self.total_score)

    def to_dict(self):
        dict_representation = {
            "username": self.username,
            "password": self.password,
            "games_played": self.games_played,
            "total_score": self.total_score
        } 
        return dict_representation

    def is_valid(self):
        """
        Returns True if the player is valid, False otherwise
        """
        if len(self.username) < 4:
            raise SmallUsernameError("Username must be at least 4 characters long")
        elif len(self.username) > 14:
            raise LargeUsernameError("Username must be at most 14 characters long")
        elif len(self.password) < 10:
            raise SmallPasswordError("Password must be at least 10 characters long")
        elif len(self.password) > 20:
            raise LargePasswordError("Password must be at most 20 characters long")
        elif self.games_played < 0:
            raise NegativeGameCountError("Games played must be a positive integer")
        elif self.total_score < 0:
            raise NegativeScoreError("Total score must be a positive integer")
        else:
            return True
    
    def to_json(self):
        try:
            self.is_valid()
        except ValueError:
            raise

        dict_representation = self.to_dict()
        return json.dumps(dict_representation)

    def from_dict(self,dict_player):
        if set(dict_player.keys()) != {"username", "password"}:
            raise ValueError("Input dictionary is not from a Player")
        
        self.username = dict_player["username"]
        self.password = dict_player["password"]

        
