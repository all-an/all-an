using System.Collections;
using System.Collections.Generic;
using UnityEngine;

public class ControlaZumbi : MonoBehaviour {

	public GameObject Jogador;
	public float Velocidade = 1;

	// Use this for initialization
	void Start () {
		
	}
	
	// Update is called once per frame
	void Update () {
		
	}

	void FixedUpdate()
    {
		float distancia = Vector3.Distance(transform.position, Jogador.transform.position);

		if (distancia > 1.5)
		{
			Vector3 direcao = Jogador.transform.position - transform.position;
			GetComponent<Rigidbody>().MovePosition(GetComponent<Rigidbody>().position + direcao.normalized * Velocidade * Time.deltaTime);

			Quaternion novaRotacao = Quaternion.LookRotation(direcao);

			GetComponent<Rigidbody>().MoveRotation(novaRotacao);
		
		}
	
	}
}
