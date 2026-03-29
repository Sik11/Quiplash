import logging
import json
import uuid
import requests

from azure.functions import HttpRequest, HttpResponse
from shared_code.Prompt import Prompt

import os

from azure.cosmos import CosmosClient
from azure.cosmos.exceptions import CosmosHttpResponseError,CosmosResourceExistsError,CosmosResourceNotFoundError
from azure.ai.translation.text import TextTranslationClient,TranslatorCredential
from azure.ai.translation.text.models import InputTextItem, TextType, ProfanityAction, ProfanityMarker

# ProxyObjects to account, database and container respectively.
# API reference here
MyCosmos = CosmosClient.from_connection_string(os.environ['AzureCosmosDBConnectionString'])
QuipLashDBProxy = MyCosmos.get_database_client(os.environ['Database'])
PlayerContainerProxy = QuipLashDBProxy.get_container_client(os.environ['PlayerContainer'])
PromptContainerProxy = QuipLashDBProxy.get_container_client(os.environ['PromptContainer'])
TranslationKey = os.environ["TranslationKey"]
TranslationEndpoint = os.environ["TranslationEndpoint"]
# Key = os.environ["FunctionAppKey"]



def main(req: HttpRequest) -> HttpResponse:
    input = req.get_json()
    prompt = json.loads(input)
    logging.info("Buckle Up, we're about to create a prompt! {}".format(prompt))
    pr_text = str(prompt.get("text"))
    pr_username = prompt.get("username")

    # Check if player exists
    try:
            query = "SELECT * FROM p WHERE p.username = @username"
            parameters = [{"name": "@username", "value": pr_username}]
            items = list(PlayerContainerProxy.query_items(
                query=query,
                parameters=parameters,
                enable_cross_partition_query=True
            ))

            # Check if a player was found and if the password matches.
            if not items:
                # Password matches, return success response.
                return HttpResponse(
                    json.dumps({
                         "result": False, 
                         "msg": "Player does not exist"}),
                    mimetype="application/json"
                )
            
    except CosmosHttpResponseError as e:
            logging.error('Cosmos DB response error occurred: {}'.format(e))
            return HttpResponse(
                json.dumps({"result": False, "msg": "An error occurred while querying the database"}),
                mimetype="application/json"
            )

    # Check the prompt length
    if len(pr_text) < 15 or len(pr_text) > 80:
        return HttpResponse(json.dumps({
            "result": False, 
            "msg": "Prompt less than 15 characters or more than 80 characters"}), 
            mimetype="application/json")
    
    #Prepare the translation jobs
    supported_languages = ['en', 'es', 'it', 'sv', 'ru', 'id', 'bg', 'zh-Hans']
    
    # Translate the language
    
    try:
        # translated_items = TranslationClient.translate(content=input_text_items,to=supported_languages)
        
        params = {
            "api-version":"3.0",
            "to": supported_languages
        } 

        d_params = {
            "api-version":"3.0"
        }

        headers = {
            'Ocp-Apim-Subscription-Key': TranslationKey ,
            'Content-type': 'application/json',
            'Ocp-Apim-Subscription-Region':'uksouth',
            'X-ClientTraceId': str(uuid.uuid4())
        }

        body = [{
            'Text': pr_text
        }]

        detect_url = TranslationEndpoint + "detect"
        detect_request = requests.post(url=detect_url, params=d_params, headers=headers, json=body)
        detect_response = detect_request.json()
        detected_language = detect_response[0]['language']
        detected_score = detect_response[0]['score']

        if not detected_language in supported_languages or detected_score < 0.3:
            return HttpResponse(json.dumps({"result": False, "msg": "Unsupported language"}), mimetype="application/json")
        
        translate_url = TranslationEndpoint + "translate"
        translate_request = requests.post(url=translate_url, params=params, headers=headers, json=body)
        translate_response = translate_request.json()
        translations = translate_response[0]['translations']
        texts = []
        for translation in translations:
             t = {
                  "language": translation['to'],
                    "text": translation['text']
             }
             texts.append(t)
        
        PromptContainerProxy.create_item(body={
             "username": pr_username,
             "texts": texts
        }, enable_automatic_id_generation=True)
        return HttpResponse(json.dumps({"result": True, "msg": "OK"}), mimetype="application/json")   
            

    except Exception as e:
        logging.error(f"An error occurred during translation: {e}")
        return HttpResponse(
            json.dumps({"result": False, "msg": "Translation failed"}),
            mimetype="application/json"
        )

    
    


